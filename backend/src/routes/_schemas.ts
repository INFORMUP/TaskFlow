import { Type, type TProperties } from "@sinclair/typebox";

// Response objects use additionalProperties: true so Fastify's fast-json-stringify
// doesn't strip fields that aren't yet enumerated here. Schemas document the
// known shape; runtime output is whatever the handler actually returns.
const openObject = <T extends TProperties>(props: T) =>
  Type.Object(props, { additionalProperties: true });

export const ErrorResponse = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String(),
        message: Type.String(),
        details: Type.Optional(Type.Unknown()),
      },
      { additionalProperties: true }
    ),
  },
  { additionalProperties: true }
);

export const IdParams = Type.Object({
  id: Type.String({ format: "uuid" }),
});

export const UserSummary = openObject({
  id: Type.String({ format: "uuid" }),
  displayName: Type.String(),
  actorType: Type.String(),
});

export const TeamSummary = openObject({
  id: Type.String({ format: "uuid" }),
  slug: Type.String(),
  name: Type.String(),
});

export const CommonErrorResponses = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  422: ErrorResponse,
  429: ErrorResponse,
  500: ErrorResponse,
};
