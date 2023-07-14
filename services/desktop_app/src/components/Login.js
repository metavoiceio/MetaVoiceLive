import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAtom } from 'jotai';
import {Auth} from "@supabase/auth-ui-react"
import {supabase} from '../supabase';
import { appModeAtom } from './App';
import logo from '../images/image.json';

import './Login.css'

// flow:
// 1. login/sign up via supabase
// 2. onAuthStateChange redirects to `/`

export default function Login() {
  const navigate = useNavigate();
  const [appMode, ] = useAtom(appModeAtom);

  useEffect(() => {
    if (appMode === 'update') {
      // how did we get here? Happens during updates
      navigate('/update');
    }
  }, [appMode])

  return (
    <div className="auth-container">
      <img src={`data:image/png;base64,${logo.image.data}`}
        alt="logo"
        className="auth-logo"
      />
      <Auth
        supabaseClient={supabase}
        appearance={{
          theme: {
            default: {
              colors: {
                brand: "#E74694",
                brandAccent: "#E74694",
                defaultButtonBackground: "rgb(75 85 99)",
                defaultButtonBackgroundHover: "rgb(75 85 99)",
              },
              borderWidths: {
                inputBorderWidth: "0",
                buttonBorderWidth: "0",
              },
            },
          },
          className: {
            button: "auth-button",
            input: "auth-input",
            label: "auth-label",
            anchor: "auth-anchor",
            divider: "auth-divider",
          },
        }}
        localization={{
          variables: {
            sign_up: {
              confirmation_text:
                "Check your email for the confirmation link.\n If you already have, use the Sign in link above",
            },
          },
        }}
        view="sign_up"
        theme="dark"
        providers={["google"]}
        magicLink={true}
      />
    </div>
  )
}
