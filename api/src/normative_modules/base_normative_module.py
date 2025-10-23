# Define a base class for all normative modules. 
class NormativeModule:
    """
    Base class for all normative modules.
    """
    def __init__(self):
        # Some description of the normative criteria.
        self.normative_criteria_description = None

    def identify_normative_criteria(self):
        """
        Given a message, identify the normative criteria.
        """
        raise NotImplementedError("Subclasses should implement this method.")

    def apply_normative_criteria(self, message):
        """
        Set the normative criteria function after initialization.
        """
        raise NotImplementedError("Subclasses should implement this method.")
        

    def check_normative_criteria(self, message):
        """
        Check if the message satisfies the normative criteria.
        """
        raise NotImplementedError("Subclasses should implement this method.")
    
    def get_history(self):
        """
        Retrieve the history of all states of the normative module. 
        """
        raise NotImplementedError("Subclasses should implement this method.")
    

        