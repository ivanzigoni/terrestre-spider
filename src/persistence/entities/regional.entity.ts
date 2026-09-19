import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('regionais')
export class Regional {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', unique: true })
  declare nome: string;
}
