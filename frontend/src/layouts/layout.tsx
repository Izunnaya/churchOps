import { Outlet } from "react-router-dom";

/*
  The frame every signed-in screen sits in. Mobile-first: one column, content
  padding 22px/28px, page background from the theme.

  There is no church name, mark, accent or navigation here yet. Those come from
  the signed-in church's own settings, and slice 1.4b owns the role-aware shell
  that renders them. A placeholder church name would be either one church's name
  shown to another or a fallback, and the brief forbids both — so the header
  carries the product wordmark, which belongs to no church, until settings are
  available.
*/
const Layout = () => {
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="flex min-h-topbar items-center border-b border-line bg-surface px-[22px] md:px-7">
        <span className="text-row-title text-ink-3">Church Operations</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-[22px] py-6 md:px-7">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
