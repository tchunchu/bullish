import yfinance as yf
import json

try:
    ticker = yf.Ticker("AAPL")
    info = ticker.info or {}
    print("KEYS IN INFO:", list(info.keys())[:30])
    
    # Financials check
    try:
        financials = ticker.income_stmt if hasattr(ticker, 'income_stmt') else ticker.financials
        print("FINANCIALS INDEX:", list(financials.index))
    except Exception as e:
        print("Financials error:", e)
        
    # Balance sheet check
    try:
        bs = ticker.balance_sheet if hasattr(ticker, 'balance_sheet') else ticker.balancesheet
        print("BALANCE SHEET INDEX:", list(bs.index))
    except Exception as e:
        print("Balance sheet error:", e)
        
except Exception as e:
    print("General error:", e)
