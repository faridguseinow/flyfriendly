import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ClaimStartModal from "./components/ClaimStartModal/index.jsx";
import Navbar from "./layout/Navbar/index.jsx";
import Footer from "./layout/Footer/index.jsx";
import AnimatedRoutes from "./routes/index.jsx";

function App() {
  const location = useLocation();
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const isClaimPage = location.pathname.startsWith("/claim");
  const isAdminPage = location.pathname.startsWith("/admin") || location.pathname.startsWith("/control-dashboard");
  const closeClaimModal = useCallback(() => setIsClaimModalOpen(false), []);

  useEffect(() => {
    const openClaimModal = () => setIsClaimModalOpen(true);

    window.addEventListener("fly-friendly:start-claim", openClaimModal);

    return () => {
      window.removeEventListener("fly-friendly:start-claim", openClaimModal);
    };
  }, []);

  return (
    <>
      {!isClaimPage && !isAdminPage && <Navbar />}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <AnimatedRoutes location={location} />
        </motion.main>
      </AnimatePresence>
      {!isClaimPage && !isAdminPage && <Footer />}
      <ClaimStartModal isOpen={isClaimModalOpen} onClose={closeClaimModal} />
    </>
  );
}

export default App;
