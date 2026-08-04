import { Helmet } from 'react-helmet-async';

/**
 * Keeps a route out of search results.
 *
 * client/index.html carries a static `robots: index, follow` for the marketing
 * pages, and this is a client-rendered SPA — vercel.json serves that same shell
 * for every path. So without an override, admin screens, tokenised booking
 * links and the catch-all 404 all inherit "index, follow" and can surface as
 * duplicates of the homepage.
 *
 * robots.txt already disallows the private paths, which stops well-behaved
 * crawlers earlier. This is the second layer, and the only control that covers
 * the 404 route — that one matches arbitrary URLs and cannot be listed in
 * robots.txt.
 */
export default function NoIndex() {
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
