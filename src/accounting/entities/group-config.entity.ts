import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class GroupConfig {
  @PrimaryColumn()
  groupId: string;

  @Column('jsonb', {
    default: [
      '飲食',
      '交通',
      '娛樂',
      '購物',
      '居家',
      '醫療',
      '學習',
      '社交',
      '理財',
    ],
  })
  categories: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
