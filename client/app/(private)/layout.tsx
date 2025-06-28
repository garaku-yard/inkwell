// import ProtectedRoute from "";

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout wraps every page inside the (private) group
  // with the ProtectedRoute component. If the user is not
  // authenticated, ProtectedRoute will redirect them to the
  // login page automatically.
  return <div>{children}</div>;
}
