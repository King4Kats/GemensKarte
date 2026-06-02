import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z, type ZodTypeAny } from "zod";

/** Valide/transforme une entrée (query, body) avec un schéma Zod partagé. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Paramètres invalides",
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
