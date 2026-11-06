export interface ResolvedRecord {
  id: string;
  no: string | number;
  date?: string;
  desc?: string;
  user?: string;
  createdAt?: string;
}

export interface Personnel {
  id: string;
  name: string;
}

export interface Assignment {
  id: string;
  date: string;
  personName: string;
}

export interface UserDoc {
  id: string;
  email: string;
  role: string;
}