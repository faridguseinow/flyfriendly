import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import Navbar from "./layout/Navbar/index.jsx";
import Footer from "./layout/Footer/index.jsx";
import AnimatedRoutes from "./routes/index.jsx";

function App() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith("/admin") || location.pathname.startsWith("/control-dashboard");

  if (isAdminPage) {
    return <AnimatedRoutes location={location} />;
  }

  return (
    <>
      <Navbar />
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
      {!location.pathname.startsWith("/claim") && <Footer />}
    </>
  );
}

export default App;
