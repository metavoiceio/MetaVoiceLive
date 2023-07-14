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
    console.log(window.location.hash);
    //TODO: This is while metavoice://magicLink isn't a valid redirect_url
    window.location.href = "metavoice://magicLink" + window.location.hash;
  }

  return <SessionContextProvider supabaseClient={supabase}>
      <div className='App'>
        <Routes>
          <Route path='/login' element={<Login />} />
          <Route path='/update' element={<Update />} />
          <Route path='*' element={<Profile />} />
        </Routes>
      </div>
    </SessionContextProvider>
}