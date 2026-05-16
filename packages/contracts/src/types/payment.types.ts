export type PaymentOperationStatus = 'pending' | 'done' | 'rejected';
export type PaymentOperationType = 'deposit' | 'withdrawal' | 'refund' | 'adjustment';

export type PaymentOperation = {
  id: string;
  userId: string;
  type: PaymentOperationType;
  status: PaymentOperationStatus;
  currency: string;
  amount: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePaymentOperationPayload = {
  userId: string;
  type: PaymentOperationType;
  currency: string;
  amount: string;
  reason?: string;
};

export type GetPaymentOperationPayload = {
  operationId: string;
};

export type ListPaymentOperationsPayload = {
  userId: string;
  limit?: number;
};

export type ListPaymentOperationsResponse = {
  operations: PaymentOperation[];
};
