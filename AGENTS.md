# Project instructions

## Project overview

This project is an internal developer platform prototype.

- Frontend: React
- Backend: Spring Boot
- Database: PostgreSQL
- Local infrastructure: Docker Compose

## Repository structure

- `frontend/`: React application
- `backend/`: Spring Boot application
- `docs/`: project documentation
- `docker-compose.yml`: local services

## Backend conventions

- Keep controllers focused on HTTP concerns.
- Put business logic in service classes.
- Use DTOs for API request and response models.
- Do not expose JPA entities directly through API responses.
- Use repository interfaces for persistence.
- Add tests when backend behavior changes.

## Frontend conventions

- Follow the existing component and folder structure.
- Keep API access separate from presentation components.
- Avoid introducing state-management libraries without approval.
- Reuse existing components before creating new abstractions.
- Add tests for important user-facing behavior.

## Database conventions

- Do not manually edit production database state.
- Use versioned migrations when schema changes are introduced.
- Do not commit credentials or real connection strings.

## Verification

- Run relevant frontend tests.
- Run relevant backend tests.
- Run linting and type checks when configured.
- Inspect the final diff.
- Report any verification that could not be completed.

## Git behavior

- Do not commit or push unless explicitly requested.
