import axios, { AxiosInstance, isAxiosError } from 'axios';
import { ServiceUnavailableError } from '../errors';
import { logger } from '../utils/logger';

interface TokenResponse {
  access_token: string;
  expiry_timestamp: string; // unix seconds
}

interface SearchResult {
  ADDRESS: string;
  POSTAL: string;
}

interface SearchResponse {
  found: number;
  results: SearchResult[];
  error?: string; // set (with HTTP 200) when the token is missing/expired
}

export interface OneMapCredentials {
  email?: string;
  password?: string;
}

type HttpClient = Pick<AxiosInstance, 'get' | 'post'>;

// Refresh the token slightly before it actually expires
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

export class OneMapClient {
  private token?: { value: string; expiresAt: number };
  private pendingToken?: Promise<string>;

  constructor(
    private readonly http: HttpClient,
    private readonly credentials: OneMapCredentials,
  ) {}

  /** Returns the full address for an exact postal code match, or null if none exists. */
  async getAddressByPostalCode(postalCode: string): Promise<string | null> {
    let response = await this.search(postalCode, await this.getToken());

    if (response === 'unauthorized') {
      // Token was rejected (e.g. revoked early): fetch a new one and retry once
      this.token = undefined;
      response = await this.search(postalCode, await this.getToken());
      if (response === 'unauthorized') {
        throw new ServiceUnavailableError('Unable to verify postal code: OneMap rejected the access token');
      }
    }

    // Search is fuzzy, so only accept an exact postal code match
    const match = response.results.find((result) => result.POSTAL === postalCode);
    return match ? match.ADDRESS : null;
  }

  private async search(postalCode: string, token: string): Promise<SearchResponse | 'unauthorized'> {
    try {
      const { data } = await this.http.get<SearchResponse>('/api/common/elastic/search', {
        params: { searchVal: postalCode, returnGeom: 'N', getAddrDetails: 'Y', pageNum: 1 },
        headers: { Authorization: token },
      });
      if (data.error) {
        return 'unauthorized';
      }
      return { found: data.found ?? 0, results: data.results ?? [] };
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        return 'unauthorized';
      }
      logger.error(`OneMap search failed: ${describeError(err)}`);
      throw new ServiceUnavailableError('Unable to verify postal code: OneMap is unavailable');
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.token.value;
    }
    // Share one in-flight token request between concurrent callers
    this.pendingToken ??= (async () => {
      try {
        return await this.fetchToken();
      } finally {
        this.pendingToken = undefined;
      }
    })();
    return this.pendingToken;
  }

  private async fetchToken(): Promise<string> {
    const { email, password } = this.credentials;
    if (!email || !password) {
      throw new ServiceUnavailableError('Unable to verify postal code: OneMap credentials are not configured');
    }

    try {
      const { data } = await this.http.post<TokenResponse>('/api/auth/post/getToken', { email, password });
      if (!data.access_token) {
        throw new Error('Response did not contain an access token');
      }
      const expirySeconds = Number(data.expiry_timestamp);
      this.token = {
        value: data.access_token,
        expiresAt: Number.isFinite(expirySeconds) ? expirySeconds * 1000 : Date.now() + DEFAULT_TOKEN_TTL_MS,
      };
      return this.token.value;
    } catch (err) {
      // Never log the error object itself: it contains the request body (credentials)
      logger.error(`OneMap authentication failed: ${describeError(err)}`);
      throw new ServiceUnavailableError('Unable to verify postal code: OneMap authentication failed');
    }
  }
}

function describeError(err: unknown): string {
  if (isAxiosError(err)) {
    return err.response ? `HTTP ${err.response.status}` : (err.code ?? err.message);
  }
  return err instanceof Error ? err.message : String(err);
}

export const oneMapClient = new OneMapClient(
  axios.create({
    baseURL: process.env.ONEMAP_BASE_URL ?? 'https://www.onemap.gov.sg',
    timeout: 10_000,
  }),
  { email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD },
);
