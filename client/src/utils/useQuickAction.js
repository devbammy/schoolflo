import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Lets a page pick up a "quick action" request handed to it through router
 * navigation state. The admin Quick Actions modal navigates to a page with
 * `state: { quickAction: <key> }`; the page passes the matching key here plus
 * the handler that opens its create form, and it fires once on arrival.
 *
 * The state is cleared immediately afterwards so a refresh or a back-navigation
 * does not re-open the form.
 */
export default function useQuickAction(key, handler) {
  const location = useLocation();
  const navigate = useNavigate();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (location.state?.quickAction !== key) return;
    fired.current = true;
    navigate(location.pathname, { replace: true, state: null });
    handler();
  }, [location, key, handler, navigate]);
}
