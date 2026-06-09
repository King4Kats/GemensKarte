import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContactService } from "./contact.service";

const RecenserBody = z.object({
  name:        z.string().min(2).max(200),
  category:    z.string().min(1).max(50),
  city:        z.string().min(1).max(120),
  postalCode:  z.string().regex(/^\d{5}$/).optional(),
  email:       z.string().email(),
  website:     z.string().url().optional().or(z.literal("")),
  description: z.string().min(10).max(1000),
});

const DeferenceBody = z.object({
  name:    z.string().min(2).max(200),
  reason:  z.string().min(1).max(100),
  message: z.string().max(500).optional(),
  email:   z.string().email().optional().or(z.literal("")),
});

@Controller("contact")
export class ContactController {
  constructor(private readonly svc: ContactService) {}

  @Post("recenser")
  @HttpCode(204)
  async recenser(@Body(new ZodValidationPipe(RecenserBody)) body: z.infer<typeof RecenserBody>) {
    await this.svc.recenser(body);
  }

  @Post("deferencer")
  @HttpCode(204)
  async deferencer(@Body(new ZodValidationPipe(DeferenceBody)) body: z.infer<typeof DeferenceBody>) {
    await this.svc.deferencer(body);
  }
}
