import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    forgotPassword: {
      expiration: 30 * 60 * 1000,
      generateEmailSubject: () => 'Reset your HelloAda password',
      generateEmailHTML: (args) => {
        const token = args?.token
        if (!token) throw new Error('Payload did not provide a password reset token')
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
        if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is required to create password reset links')
        const resetUrl = new URL('/reset-password', siteUrl)
        resetUrl.hash = new URLSearchParams({ token }).toString()
        return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#f8f0df;background:#11100f;padding:32px"><h1 style="font-size:24px">Reset your HelloAda password</h1><p>Use this one-time link to choose a new password. It expires in 30 minutes.</p><p><a href="${resetUrl.toString()}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#ff6b5e;color:#17100f;text-decoration:none;font-weight:700">Choose a new password</a></p><p style="color:#c5bcae;font-size:13px">If you did not request this, you can ignore this email.</p></div>`
      },
    },
  },
  access: {
    create: () => true,
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'password',
      type: 'text',
      hidden: true,
      minLength: 12,
    },
    {
      name: 'name',
      type: 'text',
    },
  ],
}
