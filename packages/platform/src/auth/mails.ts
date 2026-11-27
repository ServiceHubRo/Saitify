import { renderMail, type Mail } from '../mail';

const FOOTER = 'You received this email because of activity on a Saitlify account. If this was not you, you can ignore it.';

function build(to: string, subject: string, title: string, paragraphs: string[], action?: { label: string; url: string }): Mail {
  const { text, html } = renderMail({ preheader: subject, title, paragraphs, action, footer: FOOTER });
  return { to, subject, text, html };
}

export const verifyEmailMail = (to: string, name: string, url: string) =>
  build(to, 'Confirm your email for Saitlify', `Welcome, ${name}`, ['Confirm your email address to finish setting up your Saitlify account. The link works for 24 hours.'], { label: 'Confirm my email', url });

export const resetPasswordMail = (to: string, url: string) =>
  build(to, 'Reset your Saitlify password', 'Reset your password', ['We received a request to reset the password for your Saitlify account. The link works for 1 hour and can be used once.', 'If you did not ask for this, you can ignore this email: your password stays the same.'], { label: 'Choose a new password', url });

export const changeEmailMail = (to: string, url: string) =>
  build(to, 'Confirm your new email for Saitlify', 'Confirm your new email address', ['Confirm this address to use it for your Saitlify account. The link works for 1 hour.'], { label: 'Confirm new email', url });

export const alreadyRegisteredMail = (to: string, signInUrl: string) =>
  build(to, 'Someone tried to create a Saitlify account with this email', 'You already have an account', ['Someone (possibly you) tried to create a Saitlify account with this email address, but one already exists.', 'You can sign in, or reset your password if you have forgotten it.'], { label: 'Go to sign in', url: signInUrl });

export const emailChangedNotice = (to: string, newEmail: string) =>
  build(to, 'Your Saitlify email was changed', 'Your account email was changed', [`The email for your Saitlify account was changed to ${newEmail}.`, 'If you did not do this, reset your password immediately and contact support.']);

export const accountDeletedMail = (to: string) =>
  build(to, 'Your Saitlify account was deleted', 'Your account was deleted', ['Your Saitlify account and all of its projects were permanently deleted at your request.']);
