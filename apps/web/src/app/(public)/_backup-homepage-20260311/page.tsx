import { AuthAwareContent } from '~/components/home/auth-aware-content';
import { HeroSection } from '~/components/home/hero-section';

export default function Home() {
  return (
    <div className="container mx-auto space-y-10 px-4 pb-10 pt-6 md:space-y-12 md:pt-8">
      <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <HeroSection />
      </div>
      <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <AuthAwareContent />
      </div>
    </div>
  );
}
