import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Ensures same-origin /api requests carry the better-auth session cookie. In dev
 * the Angular server proxies /api to the Bun server (proxy.conf.json), so cookies
 * are same-origin.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api')) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
