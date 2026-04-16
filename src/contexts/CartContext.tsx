import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem } from '../types';
import { safeStorage } from '../utils/safeStorage';

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (contentId: string, seasonId?: string) => void;
  clearCart: () => void;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const savedCart = safeStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  useEffect(() => {
    safeStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const exists = prev.find(
        (i) => i.contentId === item.contentId && i.seasonId === item.seasonId
      );
      if (exists) return prev;
      return [...prev, item];
    });
  };

  const removeFromCart = (contentId: string, seasonId?: string) => {
    setCart((prev) =>
      prev.filter((i) => !(i.contentId === contentId && i.seasonId === seasonId))
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
