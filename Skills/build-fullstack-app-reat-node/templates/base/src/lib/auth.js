// Better Auth browser client. Same origin as the API, so no baseURL is needed.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
export const { useSession, signIn, signUp, signOut } = authClient;
