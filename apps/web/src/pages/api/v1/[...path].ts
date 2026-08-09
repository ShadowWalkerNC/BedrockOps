import type { NextApiRequest, NextApiResponse } from 'next';

const API_URL = process.env.API_URL || 'http://localhost:4000';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb'
    }
  }
};

function buildUpstreamUrl(req: NextApiRequest): string {
  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path || '';
  const queryIndex = req.url?.indexOf('?') ?? -1;
  const query = queryIndex >= 0 ? req.url!.slice(queryIndex) : '';
  return `${API_URL}/api/v1/${pathStr}${query}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = buildUpstreamUrl(req);
  const headers = new Headers();
  const contentType = req.headers['content-type'];
  const authorization = req.headers.authorization;
  if (contentType) headers.set('content-type', contentType);
  if (authorization) headers.set('authorization', authorization);
  headers.set('accept', req.headers.accept || 'application/json');

  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined
    });

    const responseType = response.headers.get('content-type');
    if (responseType) res.setHeader('content-type', responseType);
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    res.status(502).json({ error: 'Proxy error', message: String(error) });
  }
}
