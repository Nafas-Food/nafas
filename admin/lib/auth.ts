import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Nafas Admin',
      credentials: {
        phone:    { label: 'Phone',    type: 'text'     },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials.password) return null;
        try {
          const res = await axios.post(
            `${process.env.BACKEND_URL}/api/v1/auth/sign-in`,
            { phone: credentials.phone, password: credentials.password },
            { timeout: 10_000 },
          );
          const { user, accessToken, refreshToken } = res.data;
          if (user.role !== 'admin') return null;
          return {
            id: user.id,
            role: user.role,
            fullName: user.fullName,
            accessToken,
            refreshToken,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { role: string; accessToken: string; refreshToken: string };
        token.role = u.role;
        token.accessToken  = u.accessToken;
        token.refreshToken = u.refreshToken;
      }
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: string; role?: string }).accessToken = token.accessToken as string;
      (session as { accessToken?: string; role?: string }).role        = token.role as string;
      return session;
    },
  },
  pages: { signIn: '/sign-in' },
};
