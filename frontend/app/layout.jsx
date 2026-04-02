export const metadata = {
  title: 'LocumConnect',
  description: 'Authentication',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
