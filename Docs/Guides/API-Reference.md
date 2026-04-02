# API Reference

This document describes the REST API endpoints for Apex Family Tree (AFT). All endpoints are prefixed with `/api`.

---

## Common Patterns

### Authentication

Most endpoints require authentication via JWT access tokens stored in HttpOnly cookies. The token is set automatically on login and sent with every request.

| Header/Cookie | Purpose |
|---|---|
| `access_token` (cookie) | JWT access token (15 min TTL) |
| `refresh_token` (cookie) | JWT refresh token (7 day TTL) |

### Error Format

All errors return a consistent JSON structure:

```json
{
  "error": "Short error code",
  "message": "Human-readable description",
  "details": []  // Optional: validation error details
}
```

### Common HTTP Status Codes

| Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (validation error) |
| `401` | Unauthorized (missing or invalid token) |
| `403` | Forbidden (insufficient role) |
| `404` | Resource not found |
| `409` | Conflict (duplicate resource) |
| `500` | Internal server error |
| `503` | Setup required (no admin exists yet) |

### Pagination

List endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | Integer | `1` | Page number (1-based) |
| `limit` | Integer | `20` | Items per page |
| `search` | String | — | Full-text search query (where supported) |

Paginated responses include metadata:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Health

### `GET /api/health`

Health check endpoint. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Auth Endpoints

### `POST /api/auth/setup`

First-run admin account creation. Only available when no users exist.

**Request:**
```json
{
  "email": "admin@example.com",
  "display_name": "Admin User",
  "password": "securepassword"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "display_name": "Admin User",
    "role": "admin",
    "status": "active"
  }
}
```

Sets `access_token` and `refresh_token` cookies.

---

### `POST /api/auth/login`

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User Name",
    "role": "editor",
    "status": "active"
  }
}
```

Sets `access_token` and `refresh_token` cookies.

---

### `POST /api/auth/logout`

Log out the current user. Clears auth cookies and invalidates the refresh token.

**Response:** `200 OK`
```json
{
  "message": "Logged out"
}
```

---

### `POST /api/auth/refresh`

Refresh the access token using the refresh token cookie. Implements token rotation (old refresh token is invalidated).

**Response:** `200 OK`
```json
{
  "user": { ... }
}
```

Sets new `access_token` and `refresh_token` cookies.

---

### `GET /api/auth/me`

Get the currently authenticated user's profile.

**Requires:** Authentication

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User Name",
    "role": "editor",
    "status": "active",
    "home_person_id": "uuid-or-null"
  }
}
```

---

## People Endpoints

All people endpoints require authentication. Write operations require at least **Limited Editor** role.

### `GET /api/v1/people`

List persons with optional search and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | Integer | Page number |
| `limit` | Integer | Items per page |
| `search` | String | Full-text search across names |

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "sex": "M",
      "is_living": true,
      "is_private": false,
      "gedcom_id": "@I1@",
      "names": [
        {
          "id": "uuid",
          "name_type": "birth",
          "prefix": null,
          "given_name": "John",
          "surname": "Doe",
          "suffix": null,
          "is_primary": true
        }
      ]
    }
  ],
  "pagination": { ... }
}
```

---

### `POST /api/v1/people`

Create a new person.

**Requires:** Limited Editor+

**Request:**
```json
{
  "sex": "M",
  "is_living": true,
  "is_private": false,
  "names": [
    {
      "name_type": "birth",
      "given_name": "John",
      "surname": "Doe",
      "is_primary": true
    }
  ]
}
```

**Response:** `201 Created`

---

### `GET /api/v1/people/:id`

Get a person by ID, including names.

**Response:** `200 OK`

---

### `PUT /api/v1/people/:id`

Update a person's attributes.

**Requires:** Limited Editor+

---

### `DELETE /api/v1/people/:id`

Delete a person (soft delete).

**Requires:** Editor+

**Response:** `200 OK`

---

### `GET /api/v1/people/:id/relationships`

Get all relationships for a person (parents, spouses, children).

**Response:** `200 OK`
```json
{
  "parents": [...],
  "spouses": [...],
  "children": [...]
}
```

---

### `POST /api/v1/people/:id/relationships`

Add a relationship for a person.

**Requires:** Limited Editor+

**Request:**
```json
{
  "related_person_id": "uuid",
  "relationship_type": "biological"
}
```

---

## Family Endpoints

### `GET /api/v1/families`

List families with pagination.

---

### `POST /api/v1/families`

Create a family unit.

**Requires:** Limited Editor+

**Request:**
```json
{
  "spouse1_id": "uuid",
  "spouse2_id": "uuid",
  "marriage_date": "15 JUN 1990",
  "marriage_place": "New York, NY"
}
```

**Response:** `201 Created`

---

### `GET /api/v1/families/:id`

Get a family with all members (spouses, children).

---

### `PUT /api/v1/families/:id`

Update a family record.

**Requires:** Limited Editor+

---

### `DELETE /api/v1/families/:id`

Delete a family unit.

**Requires:** Editor+

---

## Event Endpoints

### `POST /api/v1/events/people/:personId/events`

Create a life event for a person.

**Requires:** Limited Editor+

**Request:**
```json
{
  "event_type": "birth",
  "event_date": "15 MAR 1950",
  "event_place": "Chicago, IL",
  "description": ""
}
```

Supported event types: `birth`, `death`, `marriage`, `burial`, `baptism`, `christening`, `adoption`, `bar_mitzvah`, `bat_mitzvah`, `census`, `divorce`, `emigration`, `immigration`, `military`, `naturalization`, `occupation`, `probate`, `retirement`, `will`, `custom`.

---

### `PUT /api/v1/events/people/:personId/events/:id`

Update a life event.

**Requires:** Limited Editor+

---

### `DELETE /api/v1/events/people/:personId/events/:id`

Delete a life event.

**Requires:** Editor+

---

## Tree Endpoints

### `GET /api/v1/tree/:personId`

Get the tree data centered on a person.

**Response:** `200 OK`
```json
{
  "person": { ... },
  "families": [...],
  "ancestors": [...],
  "descendants": [...]
}
```

---

### `GET /api/v1/tree/:personId/ancestors`

Get ancestor tree for a person.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `generations` | Integer | `3` | Number of ancestor generations (2–6) |

---

### `GET /api/v1/tree/:personId/descendants`

Get descendant tree for a person.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `generations` | Integer | `3` | Number of descendant generations (2–6) |

---

## Media Endpoints

### `POST /api/v1/media`

Upload a media file (multipart/form-data).

**Requires:** Limited Editor+

**Form Fields:**

| Field | Type | Description |
|---|---|---|
| `file` | File | The media file (JPG, PNG, PDF) |
| `person_id` | String | Person to attach media to |
| `caption` | String | Optional description |

**Limits:** Photos 10 MB, documents 50 MB.

**Response:** `201 Created`

---

### `GET /api/v1/media/:id`

Get media item metadata.

---

### `DELETE /api/v1/media/:id`

Delete a media item and its file.

**Requires:** Editor+

---

### `GET /api/v1/media/people/:id/media`

Get all media for a person.

---

### `POST /api/v1/media/people/:id/media`

Link an existing media item to a person.

**Requires:** Limited Editor+

---

## Source Endpoints

### `GET /api/v1/sources`

List all sources with pagination.

---

### `POST /api/v1/sources`

Create a source record.

**Requires:** Limited Editor+

**Request:**
```json
{
  "title": "1920 US Federal Census",
  "author": "US Census Bureau",
  "publisher": "National Archives",
  "publication_date": "1920",
  "url": "https://example.com",
  "repository_id": "uuid-or-null"
}
```

---

### `PUT /api/v1/sources/:id`

Update a source.

**Requires:** Limited Editor+

---

### `DELETE /api/v1/sources/:id`

Delete a source.

**Requires:** Editor+

---

### `POST /api/v1/sources/:id/citations`

Create a citation linking a source to an entity (person, event, family).

**Requires:** Limited Editor+

**Request:**
```json
{
  "cited_entity_type": "person",
  "cited_entity_id": "uuid",
  "citation_page": "Page 42, Line 7",
  "citation_text": "Listed as head of household"
}
```

---

## GEDCOM Endpoints

### `POST /api/v1/gedcom/import`

Upload and validate a GEDCOM file (multipart/form-data).

**Requires:** Editor+

**Form Fields:**

| Field | Type | Description |
|---|---|---|
| `file` | File | The `.ged` file |

**Response:** `200 OK`
```json
{
  "jobId": "uuid",
  "status": "validated",
  "summary": {
    "individuals": 150,
    "families": 45,
    "sources": 12,
    "mediaReferences": 8,
    "unrecognizedTags": ["_MILT", "_ADDR"],
    "validationErrors": []
  },
  "conflicts": 3
}
```

---

### `GET /api/v1/gedcom/import/:jobId`

Get import job status and progress.

---

### `GET /api/v1/gedcom/import/:jobId/conflicts`

Get unresolved conflicts for an import job.

**Response:** `200 OK`
```json
{
  "conflicts": [
    {
      "id": "uuid",
      "xref": "@I42@",
      "record_type": "individual",
      "field_name": "birth_date",
      "existing_value": "15 MAR 1920",
      "incoming_value": "ABT 1920",
      "resolution": null
    }
  ]
}
```

---

### `POST /api/v1/gedcom/import/:jobId/conflicts`

Resolve import conflicts in bulk.

**Requires:** Editor+

**Request:**
```json
{
  "resolutions": [
    { "conflict_id": "uuid", "resolution": "skip" },
    { "conflict_id": "uuid", "resolution": "overwrite" },
    { "conflict_id": "uuid", "resolution": "merge" }
  ]
}
```

---

### `POST /api/v1/gedcom/import/:jobId/process`

Start processing the import after validation and conflict resolution.

**Requires:** Editor+

**Response:** `200 OK`
```json
{
  "status": "completed",
  "statistics": {
    "personsAdded": 147,
    "personsUpdated": 3,
    "personsSkipped": 0,
    "familiesLinked": 45,
    "eventsCreated": 320,
    "sourcesCreated": 12
  }
}
```

---

### `POST /api/v1/gedcom/export`

Start a GEDCOM export job.

**Request:**
```json
{
  "gedcom_version": "5.5.1",
  "scope": "full",
  "scope_person_id": null,
  "scope_start_date": null,
  "scope_end_date": null,
  "media_option": "links"
}
```

**Scope options:** `full`, `ancestors`, `descendants`, `date_range`

**Media options:** `links`, `embedded`, `zip`

**Response:** `201 Created`
```json
{
  "jobId": "uuid",
  "status": "processing"
}
```

---

### `GET /api/v1/gedcom/export/:jobId`

Get export job status.

---

### `GET /api/v1/gedcom/export/:jobId/download`

Download the completed GEDCOM export file.

**Response:** File download (`.ged` or `.zip`)

---

## Home Person Endpoints

### `GET /api/v1/home-person`

Get the authenticated user's home person.

**Response:** `200 OK`
```json
{
  "home_person_id": "uuid-or-null"
}
```

---

### `PUT /api/v1/home-person`

Set the authenticated user's home person.

**Requires:** Editor+

**Request:**
```json
{
  "person_id": "uuid"
}
```

---

## Admin Endpoints

All admin endpoints require **Admin** role.

### `GET /api/v1/admin/users`

List all users with role counts.

**Response:** `200 OK`
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "User Name",
      "role": "editor",
      "status": "active",
      "last_login_at": "2025-01-15T10:30:00.000Z"
    }
  ],
  "roleCounts": {
    "admin": 1,
    "editor": 2,
    "limited_editor": 3,
    "viewer": 5
  }
}
```

---

### `POST /api/v1/admin/users/invite`

Send a user invitation.

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "viewer",
  "message": "Welcome to our family tree!"
}
```

**Response:** `201 Created`

---

### `GET /api/v1/admin/users/:id`

Get a user's details.

---

### `PUT /api/v1/admin/users/:id`

Update a user (role, status).

**Request:**
```json
{
  "role": "editor",
  "status": "active"
}
```

---

### `DELETE /api/v1/admin/users/:id`

Permanently delete a user account.

---

### `GET /api/v1/admin/settings`

Get all application settings. Encrypted values are masked.

**Response:** `200 OK`
```json
{
  "settings": [
    {
      "key": "site_name",
      "value": "Family Tree",
      "value_type": "string"
    },
    {
      "key": "smtp_password",
      "value": "********",
      "value_type": "encrypted"
    }
  ]
}
```

---

### `PUT /api/v1/admin/settings`

Update application settings in bulk.

**Request:**
```json
{
  "settings": [
    { "key": "site_name", "value": "The Johnson Family" },
    { "key": "smtp_host", "value": "smtp.gmail.com" }
  ]
}
```

---

### `GET /api/v1/admin/features`

Get all feature flags.

**Response:** `200 OK`
```json
{
  "features": [
    {
      "key": "gedcom_import",
      "enabled": true,
      "description": "GEDCOM file import functionality"
    }
  ]
}
```

---

### `PUT /api/v1/admin/features/:key`

Toggle a feature flag.

**Request:**
```json
{
  "enabled": true
}
```

---

## User Registration Endpoint

### `POST /api/auth/register/:token`

Register using an invitation token.

**Request:**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "password": "securepassword"
}
```

**Response:** `201 Created` — Sets auth cookies and returns user profile.

---

## Related Docs

- [Architecture](Architecture.md) — System design and component overview
- [Development Setup](Development-Setup.md) — Local development environment
- [Configuration](Configuration.md) — Environment variables and settings
