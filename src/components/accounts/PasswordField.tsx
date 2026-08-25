import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Input } from "../ui/Input";
import { useCopy } from "../../lib/useCopy";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export function PasswordField({ value, onChange, readOnly, placeholder }: Props) {
  const [visible, setVisible] = useState(false);
  const copy = useCopy();

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="pr-16"
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          type="button"
          onClick={() => copy(value, "Senha")}
          className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          title="Copiar senha"
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}
