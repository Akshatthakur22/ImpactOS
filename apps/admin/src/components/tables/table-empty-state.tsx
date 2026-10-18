export function TableEmptyState({
  colSpan,
  children,
}: {
  colSpan: number;
  children: string;
}) {
  return (
    <tr>
      <td className="py-8 text-center text-sm text-muted" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}
