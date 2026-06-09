import { Global, Module } from "@nestjs/common";
import { GeocoderService } from "./geocoder.service";

@Global()
@Module({
  providers: [GeocoderService],
  exports: [GeocoderService],
})
export class GeoModule {}
