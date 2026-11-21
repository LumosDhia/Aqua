export function FieldError({ id, message }: { id: string; message: string }) {
  return message ? <p id={id} className="mt-1 text-sm text-hanko" role="alert">{message}</p> : null
}
