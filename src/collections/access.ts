import type { Access } from 'payload'

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const deny: Access = () => false

export const isWebsiteMember: Access = ({ req }) => {
  if (!req.user) return false
  return { owner: { equals: req.user.id } }
}

export const isRelatedWebsiteMember: Access = ({ req }) => {
  if (!req.user) return false
  return { 'website.owner': { equals: req.user.id } }
}
