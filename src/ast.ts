export type ScalarType = "string" | "number" | "int" | "boolean" | "unknown";

export interface TypeRef {
  name: string;
  array: boolean;
}

export interface Constraint {
  name: "min" | "max" | "minLength" | "maxLength" | "pattern";
  value: number | string;
}

export interface FieldDefinition {
  name: string;
  optional: boolean;
  type: TypeRef;
  constraints: Constraint[];
}

export interface TypeDefinition {
  name: string;
  fields: FieldDefinition[];
}

export interface PermissionDefinition {
  name: string;
  value: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: string;
  params?: string;
  query?: string;
  body?: string;
  permission?: string;
  status?: number;
}

export interface AppDefinition {
  name: string;
  basePath: string;
  permissions: PermissionDefinition[];
  types: TypeDefinition[];
  routes: RouteDefinition[];
}
