import type {
    ArgumentsHost,
    ExceptionFilter} from '@nestjs/common';
import {
    Catch,
    HttpException,
    HttpStatus,
    Logger
} from '@nestjs/common'
import type { Response } from 'express'
import { status as GrpcStatus } from '@grpc/grpc-js'



interface GrpcException {
    code: number
    details?: string
    message?: string
}


export const grpcToHttpStatus: Record<number, number> = {
    [GrpcStatus.OK]: HttpStatus.OK, // 200

    [GrpcStatus.CANCELLED]: HttpStatus.REQUEST_TIMEOUT, // 408
    [GrpcStatus.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR, // 500
    [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST, // 400
    [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT, // 504
    [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND, // 404
    [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT, // 409
    [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN, // 403
    [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED, // 401

    [GrpcStatus.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS, // 429
    [GrpcStatus.FAILED_PRECONDITION]: HttpStatus.PRECONDITION_FAILED, // 412
    [GrpcStatus.ABORTED]: HttpStatus.CONFLICT, // 409
    [GrpcStatus.OUT_OF_RANGE]: HttpStatus.BAD_REQUEST, // 400

    [GrpcStatus.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED, // 501
    [GrpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR, // 500
    [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE, // 503
    [GrpcStatus.DATA_LOSS]: HttpStatus.INTERNAL_SERVER_ERROR // 500
}

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GrpcExceptionFilter.name)

    public catch(exception: unknown, host: ArgumentsHost): Response {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()

        if (this.isGrpcError(exception)) {
            const grpcCode = exception.code
            const status =
                grpcToHttpStatus[grpcCode] ?? HttpStatus.INTERNAL_SERVER_ERROR

            this.logger.warn(
                `gRPC error intercepted → HTTP ${status}`,
                JSON.stringify({
                    grpcCode,
                    message: exception.details ?? exception.message
                })
            )

            return response.status(status).json({
                statusCode: status,
                message: exception.details ?? exception.message ?? 'gRPC error'
            })
        }

        if (exception instanceof HttpException) {
            const status = exception.getStatus()

            return response.status(status).json({
                statusCode: status,
                message: exception.message ?? 'gRPC error'
            })
        }

        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error'
        })
    }

    /**
     * Runtime type-guard for gRPC errors
     */
    private isGrpcError(exception: unknown): exception is GrpcException {
        return (
            typeof exception === 'object' && exception !== null &&
            'code' in exception &&
            'details' in exception &&
            typeof exception.code === 'number'
        )
    }
}
