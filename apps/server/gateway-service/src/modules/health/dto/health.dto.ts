import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'gateway-service' })
  service: string;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  timestamp: string;
}
