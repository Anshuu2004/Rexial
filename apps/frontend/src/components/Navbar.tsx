import { useEffect, useState } from "react"
import { BsGithub } from "react-icons/bs"
import { HiMenuAlt3, HiX } from "react-icons/hi"
import { Link } from "react-router-dom"
import { useAuthStore } from "../store/authStore"

function Navbar() {

    const { user } = useAuthStore();

    const [menuOpen, setMenuOpen] = useState(false);
    // Transparent over the hero, solid once the page moves under it, so the
    // bar reads as part of the page rather than a slab sitting on top of it.
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // A menu left open while the page scrolls away behind it is disorienting.
    useEffect(() => {
        if (!menuOpen) return;
        const close = () => setMenuOpen(false);
        window.addEventListener('scroll', close, { passive: true });
        return () => window.removeEventListener('scroll', close);
    }, [menuOpen]);

    return (
        <header className="fixed top-0 left-0 right-0 z-40 px-2.5 sm:px-5 pt-1.5 sm:pt-3">
            <nav
                className={`max-w-7xl mx-auto rounded-2xl sm:rounded-full border transition-all duration-300
                    ${scrolled
                        ? 'bg-black/80 backdrop-blur-xl border-pink-700/40 shadow-lg shadow-pink-900/20'
                        : 'bg-black/40 backdrop-blur-md border-white/10'}`}
            >
                <div className="flex items-center justify-between h-12 sm:h-16 px-3.5 sm:px-7">

                    {/* Logo */}
                    <Link
                        to="/"
                        className="font-special text-lg sm:text-2xl md:text-3xl tracking-wider bg-clip-text text-transparent bg-linear-to-t from-pink-600 to-pink-300 hover:from-pink-500 hover:to-pink-200 transition-colors"
                    >
                        Rexial
                    </Link>

                    {/* Desktop actions */}
                    <div className="hidden sm:flex items-center gap-3 md:gap-5">
                        <a
                            className="flex items-center gap-2 text-zinc-300 hover:text-pink-400 transition-colors text-sm font-secondary tracking-wider font-bold"
                            href="https://github.com/TheCodeHeist-Coder/Rexial"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <BsGithub className="w-5 h-5" />
                            <span className="hidden md:inline">Contribute</span>
                        </a>

                        {user ? (
                            <Link
                                to="/dashboard"
                                className="font-secondary font-bold rounded-full text-sm md:text-base bg-linear-to-r from-pink-500 to-pink-700 hover:to-pink-500 hover:from-pink-700 shadow-md shadow-pink-900/30 transition duration-200 active:scale-95 px-5 md:px-6 py-2 text-gray-900 whitespace-nowrap"
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="font-secondary font-bold border border-pink-600/70 hover:border-pink-500 hover:bg-pink-600/10 px-5 md:px-6 py-2 rounded-full text-sm md:text-base active:scale-95 text-pink-500 transition duration-200 whitespace-nowrap"
                                >
                                    Login
                                </Link>

                                <Link
                                    to="/signup"
                                    className="font-secondary font-bold rounded-full text-sm md:text-base bg-linear-to-r from-pink-500 to-pink-700 hover:to-pink-500 hover:from-pink-700 shadow-md shadow-pink-900/30 transition duration-200 active:scale-95 px-5 md:px-6 py-2 text-gray-900 whitespace-nowrap"
                                >
                                    Get Started
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile: one primary action plus a menu, rather than
                        three controls shrunk until nothing is tappable. */}
                    <div className="flex sm:hidden items-center gap-2">
                        {user ? (
                            <Link
                                to="/dashboard"
                                className="font-secondary font-bold rounded-full text-xs bg-linear-to-r from-pink-500 to-pink-700 active:scale-95 px-3.5 py-1.5 text-gray-900"
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <Link
                                to="/signup"
                                className="font-secondary font-bold rounded-full text-xs bg-linear-to-r from-pink-500 to-pink-700 active:scale-95 px-3.5 py-1.5 text-gray-900"
                            >
                                Get Started
                            </Link>
                        )}

                        <button
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={menuOpen}
                            className="text-pink-500 hover:text-pink-400 p-1.5 -mr-0.5 transition-colors"
                        >
                            {menuOpen
                                ? <HiX className="w-5 h-5" />
                                : <HiMenuAlt3 className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Mobile drawer */}
                {menuOpen && (
                    <div className="sm:hidden border-t border-pink-800/30 px-5 py-4 flex flex-col gap-3">
                        {!user && (
                            <Link
                                to="/login"
                                onClick={() => setMenuOpen(false)}
                                className="font-secondary font-bold border border-pink-600/70 px-6 py-3 rounded-full text-base text-center text-pink-500 active:scale-95 transition"
                            >
                                Login
                            </Link>
                        )}

                        <a
                            className="flex items-center justify-center gap-2 text-zinc-300 hover:text-pink-400 text-base font-secondary tracking-wider font-bold py-2"
                            href="https://github.com/TheCodeHeist-Coder/Rexial"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setMenuOpen(false)}
                        >
                            <BsGithub className="w-5 h-5" />
                            Contribute on GitHub
                        </a>
                    </div>
                )}
            </nav>
        </header>
    )
}

export default Navbar
