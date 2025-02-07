import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  Package,
  Heart,
  ShoppingCart,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: "Welcome to Inventory Pro!",
    description: "Let's take a quick tour of your new inventory management system. We'll show you how to make the most of our smart features! 🚀",
    icon: Package,
    path: "/"
  },
  {
    title: "Track Your Products",
    description: "Add and manage your products in the inventory. Use our AI-powered analysis to get pricing recommendations! 📦",
    icon: Package,
    path: "/inventory"
  },
  {
    title: "Watch Market Prices",
    description: "Add items to your watchlist to monitor their market prices and get notifications when it's the right time to buy or sell! 👀",
    icon: Heart,
    path: "/watchlist"
  },
  {
    title: "Manage Orders",
    description: "Keep track of all your sales and purchases in one place. Get insights into your business performance! 🛍️",
    icon: ShoppingCart,
    path: "/orders"
  },
  {
    title: "Analytics Dashboard",
    description: "View your business performance at a glance with our powerful analytics dashboard! 📈",
    icon: TrendingUp,
    path: "/analytics"
  }
];

export function OnboardingTutorial() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [tutorialComplete, setTutorialComplete] = useLocalStorage('onboarding-complete', false);
  const [isVisible, setIsVisible] = useState(!tutorialComplete);

  const step = tutorialSteps[currentStep];

  useEffect(() => {
    if (step && isVisible) {
      setLocation(step.path);
    }
  }, [currentStep, isVisible, setLocation, step]);

  if (!isVisible) return null;

  const handleNext = () => {
    if (currentStep === tutorialSteps.length - 1) {
      setTutorialComplete(true);
      setIsVisible(false);
      setLocation("/");
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSkip = () => {
    setTutorialComplete(true);
    setIsVisible(false);
    setLocation("/");
  };

  const StepIcon = step.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
      >
        <Card className="w-[500px] shadow-lg border-primary/20">
          <CardContent className="pt-6">
            <div className="absolute top-4 right-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkip}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2 rounded-full bg-primary/10">
                <StepIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-6">
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                >
                  Skip Tour
                </Button>
              </div>
              <Button
                size="sm"
                onClick={handleNext}
              >
                {currentStep === tutorialSteps.length - 1 ? (
                  "Get Started!"
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
            <div className="flex justify-center gap-1 mt-4">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    index === currentStep ? 'bg-primary' : 'bg-primary/20'
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
