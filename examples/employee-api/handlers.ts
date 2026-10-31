import type { GeneratedHandlers } from "./generated/server.ts";

export const handlers: GeneratedHandlers = {
  authorize(_request, permission) {
    return permission === 1 || permission === 2;
  },

  getEmployee({ params, query }) {
    return {
      id: params.id,
      name: "Example employee",
      detailsIncluded: query.details ?? false,
    };
  },

  createEmployee({ body }) {
    return { id: 1, ...body };
  },
};
