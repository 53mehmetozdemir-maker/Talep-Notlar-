export interface RecordFile {
  name: string;
  url: string;
  /** Storage içindeki tam yol (silme işlemi için). */
  path?: string;
}

export interface TalepRecord {
  id: string;
  no: string | number;
  date: string;
  time?: string;
  dept?: string;
  desc?: string;
  user?: string;
  files?: RecordFile[];
}

export interface Department {
  id: string;
  name: string;
}
