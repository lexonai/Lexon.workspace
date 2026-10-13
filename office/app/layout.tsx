import './globals.css'
import OfficeShell from '@/components/shell/OfficeShell'
export const metadata = { title: 'LEXON OFFICE' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><OfficeShell>{children}</OfficeShell></body></html>)
}
