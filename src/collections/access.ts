import type { Access } from 'payload'
import { isPlatformAdmin } from '../lib/platform-admin'

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const deny: Access = () => false

export const isWebsiteMember: Access = ({ req }) => {
  if (!req.user) return false
  if (isPlatformAdmin(req.user)) return true
  return { owner: { equals: req.user.id } }
}

export const isRelatedWebsiteMember: Access = ({ req }) => {
  if (!req.user) return false
  if (isPlatformAdmin(req.user)) return true
  return { 'website.owner': { equals: req.user.id } }
}
