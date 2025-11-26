import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionType {
  EXPENSE = 'expense',
  INCOME = 'income',
}

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  groupId: string;

  @Column()
  userId: string;

  @Column({ default: 'unknown' })
  payerName: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  item: string;

  @Column()
  parentCategory: string;

  @Column()
  subCategory: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  transactionDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
