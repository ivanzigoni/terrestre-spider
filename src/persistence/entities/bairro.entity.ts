import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bairros')
export class Bairro {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', unique: true })
  declare nome: string;

  @Column({ type: 'text', unique: true, nullable: true })
  declare codigo: string | null;

  @Column({ type: 'double precision', name: 'area_km2', nullable: true })
  declare areaKm2: number | null;

  @Column({ type: 'double precision', name: 'perimetro_m', nullable: true })
  declare perimetroM: number | null;

  @Column({ type: 'text', nullable: true })
  declare geometria: string | null;
}
