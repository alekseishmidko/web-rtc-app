import { Global, Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { AuthGuard, RolesGuard } from '../../shared/guards';

//SharedModule в AppModule нужен только для DI: AuthGuard зависит от AUTH_GRPC_CLIENT, а этот provider приходит из GrpcClientsModule. Когда guard используется через @UseGuards(AuthGuard, RolesGuard), Nest должен уметь создать эти guards и их зависимости.
// Так как SharedModule помечен @Global(), достаточно один раз импортировать его в корневом модуле, после чего AuthGuard/RolesGuard доступны во всех feature-модулях gateway.
@Global()
@Module({
  imports: [GrpcClientsModule],
  providers: [AuthGuard, RolesGuard],
  exports: [AuthGuard, RolesGuard],
})
export class SharedModule {}
