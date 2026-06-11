export interface EntityConnection {
  relType: string;
  otherName: string;
  otherType: string;
  direction: 'out' | 'in';
}
