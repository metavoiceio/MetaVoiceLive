import {SessionContextProvider} from '@supabase/auth-helpers-react';
import React, { useEffect } from 'react';
import { Route, MemoryRouter, Routes, useNavigate, useLocation } from 'react-router-dom';
import posthog from 'posthog-js';
import { atom, useAtom } from 'jotai';
import { supabase } from '../supabase';
import { Keys, Urls } from '../env';

// Views
import Login from './Login';
import Update from './Update';
import Profile from './Profile';

export const appModeAtom = atom('update');

// `useNavigate` requires the component to already be inside a `Router`.
// `MemoryRouter` is preferred over other routers because it doesn't conflict with
//    supabase's url auth mechanisms.
export default function WrappedApp() {
  return <MemoryRouter>
    <App />
  </MemoryRouter>
}

// email links will hit this route, which is opened in a browser;
const isBrowser = window.electronAPI === undefined;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [appMode, setAppMode] = useAtom(appModeAtom);

  useEffect(() => {
    posthog.init(Keys.posthog, {
      api_host: Urls.posthog,
    });

    if (!isBrowser) {
      // will navigate back to '/' if app mode is not update
      navigate('/update');

      window.electronAPI.getAppMode().then((mode) => {
        console.log('app mode received:', mode);
        setAppMode(mode);

        if (mode === 'update') {
          // should already be in /update

          // only start supabase checks if not in update mode
          return;
        } else {
          navigate('/');
        }

        if (!supabase || !supabase.auth) return;

        const {
          data: { subscription }
        } = supabase.auth.onAuthStateChange((event, session) => {
          // probably not needed
          if (location.pathname === '/update') return;

          if (event === 'SIGNED_IN' && location.pathname === '/login') {
            console.log('login succeeded, navigating to /');
            navigate('/');
          }
          if (event === 'SIGNED_OUT' && location.pathname !== '/login') {
            console.log('logout succeeded, navigating to /login');
            navigate('/login');
          }

          if (session) {
            // hack: alias the previous anonymous user with the authorized user id
            const email = session.user.email;
            const name = session.user.user_metadata.name;

            const prev_posthog_id = posthog.get_distinct_id();
            posthog.identify(session.user.id, { name, email });
            posthog.alias(prev_posthog_id);
          }
        });

        // does nothing here, but keep so we remember when cleaning
        return () => subscription.unsubscribe();
      });
    }
  }, []);

  if (isBrowser) {
    // while metavoice://magicLink isn't a valid redirect_url
    window.location.href = "metavoice://magicLink" + window.location.hash;

    return <SessionContextProvider supabaseClient={supabase}>
      <div className='App'>
        <h1>Please open MetaVoice Live to continue</h1>
        <p>If nothing happens, try reloading the application with Ctrl+R</p>
      </div>
    </SessionContextProvider>
  }

  return <SessionContextProvider supabaseClient={supabase}>
      <div className='App'>
        <Routes>
          <Route path='/login' element={<Login />} />
          <Route path='/update' element={<Update />} />
          <Route path='*' element={<Profile />} />
        </Routes>
        <HelpLink />
      </div>
    </SessionContextProvider>
}

function HelpLink() {
  return <div className="position-fixed bottom-0 end-0 p-2">
    <a href="https://discord.gg/Cpy6U3na8Z" rel="noreferrer" target="_blank" title="get help on our Discord server!">
      <svg className="text-white" width="24" fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    </a>
  </div>
}