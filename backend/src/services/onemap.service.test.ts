import { AxiosError, AxiosHeaders } from 'axios';
import { ServiceUnavailableError } from '../errors';
import { OneMapClient } from './onemap.service';

const credentials = { email: 'user@example.com', password: 'secret' };
const inOneDay = () => String(Math.floor(Date.now() / 1000) + 86400);

const tokenResponse = (token = 'token-1') => ({
  data: { access_token: token, expiry_timestamp: inOneDay() },
});

const searchResponse = (results: { ADDRESS: string; POSTAL: string }[]) => ({
  data: { found: results.length, results },
});

const httpError = (status: number) =>
  new AxiosError('error', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

function createClient() {
  const http = { get: jest.fn(), post: jest.fn() };
  const client = new OneMapClient(http as never, credentials);
  return { http, client };
}

describe('OneMapClient.getAddressByPostalCode', () => {
  it('returns the address of the exact postal code match', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockResolvedValue(
      searchResponse([
        { ADDRESS: 'OTHER PLACE SINGAPORE 018957', POSTAL: '018957' },
        { ADDRESS: '10 BAYFRONT AVENUE SINGAPORE 018956', POSTAL: '018956' },
      ]),
    );

    await expect(client.getAddressByPostalCode('018956')).resolves.toBe('10 BAYFRONT AVENUE SINGAPORE 018956');
    expect(http.post).toHaveBeenCalledWith('/api/auth/post/getToken', credentials);
    expect(http.get).toHaveBeenCalledWith(
      '/api/common/elastic/search',
      expect.objectContaining({
        params: expect.objectContaining({ searchVal: '018956' }),
        headers: { Authorization: 'token-1' },
      }),
    );
  });

  it('returns null when no result matches the postal code exactly', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockResolvedValue(searchResponse([{ ADDRESS: 'SOMEWHERE', POSTAL: '018957' }]));

    await expect(client.getAddressByPostalCode('018956')).resolves.toBeNull();
  });

  it('reuses a cached token across calls', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockResolvedValue(searchResponse([]));

    await client.getAddressByPostalCode('018956');
    await client.getAddressByPostalCode('018956');

    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token and retries once when OneMap reports a token error', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValueOnce(tokenResponse('stale')).mockResolvedValueOnce(tokenResponse('fresh'));
    http.get
      .mockResolvedValueOnce({ data: { error: 'Authentication token missing', found: 0, results: [] } })
      .mockResolvedValueOnce(searchResponse([{ ADDRESS: 'ADDR', POSTAL: '018956' }]));

    await expect(client.getAddressByPostalCode('018956')).resolves.toBe('ADDR');
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[1][1].headers).toEqual({ Authorization: 'fresh' });
  });

  it('refreshes the token on HTTP 401', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce(searchResponse([]));

    await expect(client.getAddressByPostalCode('018956')).resolves.toBeNull();
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('fails when the token is still rejected after refreshing', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockResolvedValue({ data: { error: 'Invalid token', found: 0, results: [] } });

    await expect(client.getAddressByPostalCode('018956')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('fails with a 500 error when OneMap is unreachable', async () => {
    const { http, client } = createClient();
    http.post.mockResolvedValue(tokenResponse());
    http.get.mockRejectedValue(httpError(503));

    await expect(client.getAddressByPostalCode('018956')).rejects.toMatchObject({ status: 500 });
  });

  it('fails when authentication fails', async () => {
    const { http, client } = createClient();
    http.post.mockRejectedValue(httpError(401));

    await expect(client.getAddressByPostalCode('018956')).rejects.toThrow('OneMap authentication failed');
  });

  it('fails when credentials are not configured', async () => {
    const http = { get: jest.fn(), post: jest.fn() };
    const client = new OneMapClient(http as never, {});

    await expect(client.getAddressByPostalCode('018956')).rejects.toThrow('credentials are not configured');
    expect(http.post).not.toHaveBeenCalled();
  });
});
