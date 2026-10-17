import { BsEnvelopeFill, BsGithub, BsGlobe2, BsHeartFill, BsLinkedin, BsTwitterX } from "react-icons/bs"
import { Link } from "react-router-dom"

const SOCIALS = [
  {
    label: 'Portfolio',
    href: 'https://iam-raj.vercel.app/',
    Icon: BsGlobe2,
  },
  {
    label: 'GitHub',
    href: 'https://github.com/TheCodeHeist-Coder',
    Icon: BsGithub,
  },
  {
    label: 'X',
    href: 'https://x.com/CodeHeistCoder',
    Icon: BsTwitterX,
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/raj-kumar-54225532a/',
    Icon: BsLinkedin,
  },
  {
    label: 'Email',
    href: 'mailto:thecodeheist01@gmail.com',
    Icon: BsEnvelopeFill,
  },
]


function Footer() {
  return (
    <footer className="text-gray-200 border-t border-pink-900/30">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-6 sm:py-7">

        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center md:justify-between gap-y-3 gap-x-5 sm:gap-x-6">

          {/* Left: brand and credit on one line */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
            <Link
              to="/"
              className="font-special text-xl sm:text-2xl tracking-wider bg-clip-text text-transparent bg-linear-to-t from-pink-600 to-pink-300 shrink-0"
            >
              Rexial
            </Link>

            <span className="hidden sm:inline w-px h-5 bg-pink-800/40" />

            <p className="text-sm font-secondary tracking-wide text-zinc-400 flex items-center gap-1.5">
              Made with
              <BsHeartFill className="w-3.5 h-3.5 text-pink-500 animate-pulse" aria-label="love" />
              by
              <a
                href="https://iam-raj.vercel.app/"
                target="_blank"
                rel="noreferrer"
                className="font-bold bg-clip-text text-transparent bg-linear-to-r from-pink-400 to-pink-600 hover:from-pink-300 hover:to-pink-500 transition-colors"
              >
                Rajkumar
              </a>
            </p>

            <span className="hidden md:inline text-xs text-zinc-600 font-secondary tracking-wide">
              © {new Date().getFullYear()}
            </span>
          </div>

          {/* Open source, and an invitation to contribute */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-secondary tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Open source
            </span>

            <a
              href="https://github.com/TheCodeHeist-Coder/Rexial"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-secondary tracking-wider text-pink-400 bg-pink-600/10 border border-pink-600/40 hover:bg-pink-600/20 hover:border-pink-500 hover:text-pink-300 active:scale-95 rounded-full px-3 py-1 transition duration-200"
            >
              <BsGithub className="w-3.5 h-3.5" />
              Open to contribute
            </a>
          </div>

          {/* Right: socials */}
          <div className="flex items-center gap-2.5 shrink-0">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith('mailto:') ? undefined : '_blank'}
                rel="noreferrer"
                aria-label={label}
                title={label}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-white/10 text-zinc-400 hover:text-pink-400 hover:border-pink-600/50 hover:bg-pink-600/10 active:scale-95 transition duration-200"
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
