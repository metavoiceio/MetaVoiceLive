import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Conversion from './Conversion';
import Loading from './Loading';
import posthog from 'posthog-js';

export default function Profile() {
  const supabase = useSupabaseClient();
  const [userMetadata, setUserMetadata] = useState();
  const navigate = useNavigate();

  useEffect(() => {
    // On mount, we check if a user is logged in.
    // If so, we'll retrieve the authenticated user's profile.
    supabase.auth.getUser()
      .then(res => {
        if (res.data.user) {
          const { user } = res.data;
          posthog.identify(user.email, { email: user.email })
          setUserMetadata(user);
        } else {
          navigate('/login', {replace: true});
        }
      })
      .catch(error => {
        console.log(`error with fetching metadata. error: ${error}`)
      });
  }, []);

  return userMetadata ? (
    <Conversion email={userMetadata.email} issuer={userMetadata.issuer} />
  ) : <Loading isActive={!userMetadata} text={'Authenticating...'} />;
}
