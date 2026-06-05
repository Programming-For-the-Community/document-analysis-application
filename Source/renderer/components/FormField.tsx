import { FormFieldProps } from '../../interfaces/renderer/login';

export function FormField({ label, id, type = 'text', value, placeholder, autoComplete, onChange }: FormFieldProps) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        type={type}
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}