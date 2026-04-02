# User Management

This guide explains how to manage users in Apex Family Tree (AFT), including understanding roles, inviting new users, and managing existing accounts. User management is available to **Admin** users only.

---

## Understanding Roles

AFT uses four roles to control what each user can do. Every user is assigned exactly one role.

### Role Permissions

| Capability | Admin | Editor | Limited Editor | Viewer |
|---|---|---|---|---|
| View the family tree | ✅ | ✅ | ✅ | ✅ |
| View people, sources, and media | ✅ | ✅ | ✅ | ✅ |
| Search for people | ✅ | ✅ | ✅ | ✅ |
| Create new people | ✅ | ✅ | ✅ | ❌ |
| Edit existing people | ✅ | ✅ | ✅ | ❌ |
| Add events, media, and sources | ✅ | ✅ | ✅ | ❌ |
| Link relationships | ✅ | ✅ | ✅ | ❌ |
| Delete people or families | ✅ | ✅ | ❌ | ❌ |
| Set Home Person for any user | ✅ | ✅ | ❌ | ❌ |
| Import GEDCOM files | ✅ | ✅ | ❌ | ❌ |
| Export GEDCOM files | ✅ | ✅ | ✅ | ✅ |
| Manage users (invite, edit, suspend) | ✅ | ❌ | ❌ | ❌ |
| Access application settings | ✅ | ❌ | ❌ | ❌ |
| Configure SMTP and instance settings | ✅ | ❌ | ❌ | ❌ |

### Role Descriptions

**Admin** — Full access to everything. Admins can manage users, change application settings, and perform all data operations. There should always be at least one Admin account.

**Editor** — Can add, edit, and delete any person or family record. Editors are trusted contributors who help build and maintain the tree. They cannot manage users or change application settings.

**Limited Editor** — Can add new entries and edit existing ones, but **cannot delete** any records. This is ideal for family members who want to contribute but shouldn't be able to accidentally remove data.

**Viewer** — Read-only access. Viewers can browse the tree, view person details, and search, but cannot make any changes. This is perfect for family members who just want to explore the tree.

> **Tip:** When in doubt, start new users as **Viewers** and upgrade their role as needed. It's easier to grant more access than to undo accidental deletions.

---

## The User Management Screen

Navigate to the User Management screen at **Settings > User Management** or directly at `/admin/users`.

### What You'll See

The screen contains:

1. **Page header** with a **+ Invite user** button
2. **Role filter cards** — Four cards (Admin, Editor, Limited Editor, Viewer) that filter the user table when clicked
3. **User table** — A list of all users with the following columns:

| Column | Description |
|---|---|
| **User** | Avatar, display name, and email address |
| **Role** | The user's current role (shown as a colored badge) |
| **Status** | Current account status (see below) |
| **Last active** | When the user last logged in |
| **Actions** | Edit link to modify the user |

### User Statuses

| Status | Badge Color | Meaning |
|---|---|---|
| **Active** | Green | User has registered and can log in normally |
| **Invited** | Amber | Invitation sent but user hasn't registered yet |
| **Inactive** | Gray | Account has been deactivated |
| **Suspended** | Red | Access has been revoked by an admin |

---

## Inviting New Users

AFT uses an **invite-only** registration system. There is no public sign-up page. Only Admins can invite new users.

### How to Send an Invite

1. Navigate to **Settings > User Management**
2. Click the **+ Invite user** button
3. Fill in the invite form:
   - **Email address** — The new user's email (where the invitation will be sent)
   - **Role** — Choose the role for this user (Admin, Editor, Limited Editor, or Viewer)
   - **Personal message** *(optional)* — Add a friendly note to the invitation email
4. Click **Send invitation**

> **Note:** SMTP email must be configured for invitations to be sent. See the [Configuration Guide](Configuration.md) for SMTP setup. If SMTP is not configured, you'll need to share the invite link manually.

### What the Invited User Receives

The invited user receives an email containing:

- A welcome message explaining that they've been invited to your family tree
- Your optional personal message
- A **registration link** with a unique, one-time token

### The Registration Process

When the invited user clicks the registration link, they're taken to a registration page where they:

1. Enter their **First name** and **Last name**
2. Choose a **Password** and confirm it
3. Click **Create account**

On successful registration, they're automatically logged in and redirected to the tree view.

> **Warning:** Invite links expire after **48 hours**. If a user doesn't register within that time, you'll need to send a new invitation.

> **Note:** The invited user appears in your user table with an **Invited** (amber) status badge until they complete registration, at which point their status changes to **Active** (green).

---

## Managing Existing Users

### Editing a User

1. Find the user in the user table
2. Click the **Edit** link in the Actions column
3. The edit modal appears with the following options:

   - **Role** — Change the user's role using the dropdown
   - **Status** — Change the user's account status

4. Click **Save changes**

> **Note:** Role changes take effect on the user's **next API request**. If the user is currently logged in, they may need to refresh their browser to see the updated permissions reflected in the UI.

### Changing a User's Role

To promote or demote a user:

1. Click **Edit** next to the user
2. Select the new role from the **Role** dropdown
3. Click **Save changes**

Common scenarios:

| Scenario | Action |
|---|---|
| Family member wants to start contributing | Change from Viewer to Limited Editor |
| Trusted contributor needs delete access | Change from Limited Editor to Editor |
| Need another admin for backup | Change from Editor to Admin |
| User was given too much access | Downgrade their role accordingly |

### Suspending a User

If you need to immediately revoke a user's access:

1. Click **Edit** next to the user
2. In the **Danger zone** section, click **Revoke access**
3. Confirm the action

This sets the user's status to **Suspended**. On their next API request, they'll receive a `403 Forbidden` response and be redirected to the login page. Their account data is preserved but they cannot log in.

> **Tip:** Suspension is reversible. You can change the status back to **Active** by editing the user again.

### Deleting a User

To permanently remove a user account:

1. Click **Edit** next to the user
2. Click **Delete user** (in the danger zone)
3. Confirm the deletion

> **Warning:** Deleting a user removes their account permanently. Any tree data they created (people, events, sources) is preserved — the `created_by` reference is simply cleared.

---

## Password Reset

### When SMTP Is Configured

If SMTP email is set up (see [Configuration Guide](Configuration.md)):

1. The user clicks **"Forgot password?"** on the login screen
2. They enter their email address
3. AFT sends a password reset email with a tokenized link
4. The link is valid for **1 hour**
5. The user clicks the link and sets a new password

### When SMTP Is Not Configured

If SMTP is not available, an Admin must assist:

1. The user contacts the Admin
2. The Admin can either:
   - Reset the user's password directly from the user management screen
   - Delete the user's account and re-invite them

> **Tip:** Setting up SMTP is highly recommended for a smooth user experience. See the [Configuration Guide](Configuration.md) for SMTP configuration details.

---

## Best Practices

1. **Keep at least two Admin accounts.** If you lose access to your only Admin account, recovery options are limited.

2. **Use the principle of least privilege.** Start users with the minimum access they need. A Viewer who wants to contribute can always be upgraded to Limited Editor.

3. **Review user access periodically.** Check the user table for inactive accounts or users who may no longer need access.

4. **Use personal messages in invitations.** A friendly note explaining what the family tree is and what they can do with it significantly improves the registration rate.

5. **Communicate role expectations.** Let Editors know the conventions you've established (e.g., always add sources, use specific date formats, privacy settings for living people).

---

## Related Guides

- [Getting Started](Getting-Started.md) — Initial admin account setup
- [Configuration Reference](Configuration.md) — SMTP setup for invitations and password resets
- [Managing Your Tree](Managing-Your-Tree.md) — Understanding what each role can do in the tree
