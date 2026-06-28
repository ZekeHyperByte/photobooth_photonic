declare module 'midtrans-client' {
  interface MidtransConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  export class CoreApi {
    constructor(config: MidtransConfig);
    charge(parameter: any): Promise<any>;
    transaction: {
      status(orderId: string): Promise<any>;
      notification(payload: any): Promise<any>;
      cancel(orderId: string): Promise<any>;
    };
  }

  export class Snap {
    constructor(config: MidtransConfig);
    createTransaction(parameter: any): Promise<any>;
  }
}
