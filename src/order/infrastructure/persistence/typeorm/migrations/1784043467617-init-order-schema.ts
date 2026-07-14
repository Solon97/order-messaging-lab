import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitOrderSchema1784043467617 implements MigrationInterface {
  name = 'InitOrderSchema1784043467617';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "orderId" uuid NOT NULL,
        "customerId" uuid NOT NULL,
        "status" varchar NOT NULL,
        "totalAmount" numeric(12,2) NOT NULL,
        "createdAt" timestamptz NOT NULL,
        CONSTRAINT "PK_orders_orderId" PRIMARY KEY ("orderId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "orderItemId" uuid NOT NULL,
        "orderId" uuid NOT NULL,
        "sku" varchar NOT NULL,
        "quantity" integer NOT NULL,
        "unitPrice" numeric(12,2) NOT NULL,
        CONSTRAINT "PK_order_items_orderItemId" PRIMARY KEY ("orderItemId"),
        CONSTRAINT "FK_order_items_orderId" FOREIGN KEY ("orderId")
          REFERENCES "orders" ("orderId") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }
}
